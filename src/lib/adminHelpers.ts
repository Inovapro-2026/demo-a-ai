import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.ts';

export async function writeAuditLog(
  action: string,
  targetType: string,
  targetId: string,
  details: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'auditLogs'), {
      actorUid: user.uid,
      actorEmail: user.email || 'admin',
      action: action.slice(0, 100),
      targetType: targetType.slice(0, 60),
      targetId: targetId.slice(0, 128),
      details: details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Audit log write skipped:', error);
  }
}

export async function uploadAdminImage(file: File, getIdToken: () => Promise<string | null>): Promise<string> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
    reader.readAsDataURL(file);
  });

  const resp = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      dataBase64,
    }),
  });

  const payload = (await resp.json()) as { url?: string; error?: string };
  if (!resp.ok || !payload.url) {
    throw new Error(payload.error || 'Erro ao enviar imagem.');
  }
  return payload.url;
}

export function playNewOrderChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880.0]; // D5 -> A5 chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.38);
    });
  } catch {
    // Ignore autoplay restriction before user interaction
  }
}
