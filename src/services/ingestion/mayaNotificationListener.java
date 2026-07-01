package com.iscan.mayaingestor;

import android.content.ComponentName;
import android.content.SharedPreferences;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class MayaNotificationListener extends NotificationListenerService {

    private static final String TAG = "MayaIngestor";

    // ── Watched packages ─────────────────────────────────────────────────
    private static final String MAYA_PACKAGE     = "com.paymaya";
    private static final String MARIBANK_PACKAGE = "ph.seabank.seabank";

    // ── Backend endpoints ─────────────────────────────────────────────────
    private static final String BASE_URL         = "https://iscansystem.up.railway.app/api/v1";
    private static final String MAYA_URL         = BASE_URL + "/maya/notify";
    private static final String MARIBANK_URL     = BASE_URL + "/maribank/notify";

    // ── Shared secret ─────────────────────────────────────────────────────
    // TODO(security): this is a static secret embedded in the APK and can be
    // extracted via jadx/apktool in minutes. It is the ONLY auth on the
    // deposit-notify endpoints right now, so anyone with the APK can forge
    // deposit events. This should be replaced with a per-device token issued
    // by the backend on first registration (e.g. POST /device/register ->
    // returns a device-scoped token stored in EncryptedSharedPreferences).
    // Left as-is here so the app keeps running against the existing backend
    // contract; treat this as a follow-up, not resolved.
    private static final String MAYA_SECRET      = "f9dfc28b154addf48ef4ba4b970c9d17c7020d4e00c367c0367a114c559fdc3f";

    // ── Retry queue ──────────────────────────────────────────────────────
    private static final String PREFS_NAME    = "ingestor_retry_queue";
    private static final String PREFS_KEY     = "pending_events";
    private static final int    MAX_ATTEMPTS  = 5;
    private static final long   BASE_DELAY_MS = 2000L; // 2s, doubles each attempt

    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();

    // ── Reconnect dedup guard ───────────────────────────────────────────
    // When the listener rebinds (OEM kill, app update, manual toggle), Android
    // may redeliver notifications still present in the shade. This in-memory
    // map suppresses re-forwarding of anything already sent in the last
    // DEDUP_WINDOW_MS. This is a client-side safety net; the server-side
    // minuteBucket hash dedup remains the authoritative guard.
    private static final long DEDUP_WINDOW_MS = 5 * 60 * 1000L; // 5 minutes
    private final Map<String, Long> recentlySent =
        new LinkedHashMap<String, Long>(128, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > 200; // cap memory use
            }
        };

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification listener connected!");
        flushRetryQueue();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "Notification listener disconnected — requesting rebind");
        // FIX: without this, an OS-initiated unbind can leave the listener
        // dead until the user manually re-toggles notification access.
        requestRebind(new ComponentName(this, MayaNotificationListener.class));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String pkg = sbn.getPackageName();

        // Only process Maya and MariBank notifications
        if (!MAYA_PACKAGE.equals(pkg) && !MARIBANK_PACKAGE.equals(pkg)) return;

        android.os.Bundle extras = sbn.getNotification().extras;
        String title   = extras.getString("android.title", "");
        String text    = extras.getCharSequence("android.text") != null
                         ? extras.getCharSequence("android.text").toString() : "";
        String bigText = extras.getCharSequence("android.bigText") != null
                         ? extras.getCharSequence("android.bigText").toString() : text;

        String body = bigText.isEmpty() ? text : bigText;
        if (body.isEmpty() && title.isEmpty()) return;

        // Dedup check — same key + same post time means this is a redelivery,
        // not a new event.
        String dedupKey = sbn.getKey() + "|" + sbn.getPostTime();
        synchronized (recentlySent) {
            Long lastSeen = recentlySent.get(dedupKey);
            long now = System.currentTimeMillis();
            if (lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS) {
                Log.d(TAG, "Skipping duplicate/redelivered notification: " + dedupKey);
                return;
            }
            recentlySent.put(dedupKey, now);
        }

        Log.d(TAG, "[" + pkg + "] title: " + title + " | text: " + body);

        String endpoint = MAYA_PACKAGE.equals(pkg) ? MAYA_URL : MARIBANK_URL;
        String source   = MAYA_PACKAGE.equals(pkg) ? "MAYA_ANDROID" : "MARIBANK_ANDROID";

        JSONObject payload = buildPayload(title, body, source);
        sendWithRetry(endpoint, payload, 0);
    }

    private JSONObject buildPayload(String title, String text, String source) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("title", title);
            payload.put("text", text);
            payload.put("timestamp", System.currentTimeMillis());
            payload.put("source", source);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build payload: " + e.getMessage());
        }
        return payload;
    }

    private void sendWithRetry(String endpoint, JSONObject payload, int attempt) {
        retryExecutor.execute(() -> {
            boolean success = attemptSend(endpoint, payload);
            if (success) return;

            if (attempt + 1 >= MAX_ATTEMPTS) {
                Log.e(TAG, "Max attempts reached, persisting to disk for later retry: " + payload);
                persistFailedEvent(endpoint, payload);
                return;
            }

            long delay = BASE_DELAY_MS * (1L << attempt); // exponential backoff
            Log.w(TAG, "Send failed, retrying in " + delay + "ms (attempt " + (attempt + 1) + ")");
            retryExecutor.schedule(
                () -> sendWithRetry(endpoint, payload, attempt + 1),
                delay,
                TimeUnit.MILLISECONDS
            );
        });
    }

    private boolean attemptSend(String endpoint, JSONObject payload) {
        try {
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);

            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-maya-secret", MAYA_SECRET);
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }

            int code = conn.getResponseCode();
            conn.disconnect();

            boolean ok = code >= 200 && code < 300;
            Log.d(TAG, "Forwarded to " + endpoint + " — HTTP " + code + (ok ? " (ok)" : " (failed)"));
            return ok;

        } catch (Exception e) {
            Log.e(TAG, "Failed to forward to " + endpoint + ": " + e.getMessage());
            return false;
        }
    }

    // ── Disk-persisted queue for events that exhausted in-memory retries ──
    // Ensures an event isn't lost if the process dies mid-retry (OEM kill,
    // crash, phone reboot). Flushed on next onListenerConnected().

    private void persistFailedEvent(String endpoint, JSONObject payload) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        try {
            JSONArray queue = new JSONArray(prefs.getString(PREFS_KEY, "[]"));
            JSONObject entry = new JSONObject();
            entry.put("endpoint", endpoint);
            entry.put("payload", payload);
            queue.put(entry);
            prefs.edit().putString(PREFS_KEY, queue.toString()).apply();
        } catch (JSONException e) {
            Log.e(TAG, "Failed to persist event to disk: " + e.getMessage());
        }
    }

    private void flushRetryQueue() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String raw = prefs.getString(PREFS_KEY, "[]");
        try {
            JSONArray queue = new JSONArray(raw);
            if (queue.length() == 0) return;

            Log.i(TAG, "Flushing " + queue.length() + " persisted event(s) from disk queue");
            prefs.edit().putString(PREFS_KEY, "[]").apply(); // clear immediately, re-persist any that still fail

            for (int i = 0; i < queue.length(); i++) {
                JSONObject entry = queue.getJSONObject(i);
                String endpoint = entry.getString("endpoint");
                JSONObject payload = entry.getJSONObject("payload");
                sendWithRetry(endpoint, payload, 0);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Failed to read persisted queue: " + e.getMessage());
        }
    }
}
