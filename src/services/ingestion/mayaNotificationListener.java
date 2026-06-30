package com.iscan.mayaingestor;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MayaNotificationListener extends NotificationListenerService {

    private static final String TAG = "MayaIngestor";
    private static final String MAYA_PACKAGE = "ph.paymaya.personal";
    // Change this to your server IP or Railway URL
    private static final String SERVER_URL = "http://192.168.1.29:3000/api/v1/maya/notify";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!MAYA_PACKAGE.equals(sbn.getPackageName())) return;

        android.os.Bundle extras = sbn.getNotification().extras;
        String title   = extras.getString("android.title", "");
        String text    = extras.getCharSequence("android.text") != null
                         ? extras.getCharSequence("android.text").toString() : "";
        String bigText = extras.getCharSequence("android.bigText") != null
                         ? extras.getCharSequence("android.bigText").toString() : text;

        Log.d(TAG, "Maya notif — title: " + title + " | text: " + bigText);

        // Only forward financial notifications
        if (bigText.isEmpty() && text.isEmpty()) return;

        forwardToServer(title, bigText.isEmpty() ? text : bigText);
    }

    private void forwardToServer(String title, String text) {
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("title", title);
                payload.put("text", text);
                payload.put("timestamp", System.currentTimeMillis());
                payload.put("source", "MAYA_ANDROID");

                byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);

                URL url = new URL(SERVER_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("x-maya-secret", BuildConfig.MAYA_SECRET);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }

                int code = conn.getResponseCode();
Log.d(TAG, "POST URL = " + SERVER_URL);
                Log.d(TAG, "Forwarded to server — HTTP " + code);
                conn.disconnect();

            } catch (Exception e) {
                Log.e(TAG, "Failed to forward notification: " + e.getMessage());
            }
        }).start();
    }
}
