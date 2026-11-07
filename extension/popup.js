const $ = id => document.getElementById(id);
let roomId = null, inFlight = false;
async function message(type) {
  const response = await chrome.runtime.sendMessage({ type, endpoint: $('endpoint').value.trim(), roomId: $('room').value.trim() });
  if (response?.error) throw Error(response.error);
  return response;
}
async function refresh() {
  const s = await message('status'); roomId = s.roomId;
  if (s.bound && s.endpoint) $('endpoint').value = s.endpoint;
  $('status').textContent = s.status;
  $('details').textContent = s.bound ? `${s.role === 'host' ? 'Chủ phòng' : 'Thành viên'} · ${s.count} người · ${s.contentId}` : 'Mở video YouTube. Chọn tạo phòng hoặc vào phòng.';
  for (const name of ['create', 'join', 'endpoint', 'room', 'grant']) $(name).disabled = s.bound || inFlight;
  $('copy').hidden = !s.roomId; $('leave').hidden = !s.bound;
}
for (const type of ['create', 'join', 'leave']) $(type).addEventListener('click', async () => {
  if (inFlight) return; inFlight = true; $('error').textContent = '';
  try { await message(type); } catch (e) { $('error').textContent = e.message; }
  finally { inFlight = false; await refresh(); }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(roomId); $('error').textContent = 'Đã sao chép mã phòng.'; }
  catch { $('error').textContent = `Mã phòng: ${roomId}`; }
});
$('grant').addEventListener('click', async () => {
  try {
    const u = new URL($('endpoint').value);
    if (u.protocol !== 'wss:') throw Error('Máy chủ từ xa cần địa chỉ wss://.');
    const ok = await chrome.permissions.request({ origins: [`https://${u.host}/*`] });
    $('error').textContent = ok ? 'Đã cấp quyền máy chủ.' : 'Chưa cấp quyền.';
  } catch (e) { $('error').textContent = e.message; }
});
refresh().catch(e => { $('error').textContent = e.message; });
setInterval(() => refresh().catch(() => {}), 1000);
