// public/js/api.js

export async function apiGet(url) {
  const res = await fetch(url, {
    credentials: 'same-origin'
  });
  return res.json();
}

export async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
