/**
 * Réduction de la photo d'un visuel dans le navigateur (#291) : côté de 1080 px au plus (la taille du visuel), puis une qualité
 * décroissante jusqu'à passer sous 1 Mo. Le serveur recontrôle tout : cette étape n'est qu'une commodité.
 */
const SIDE = 1080;
const LIMIT = 1024 * 1024;

export async function resizeVisualPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  let blob: Blob | null = null;
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    blob = await encode(quality);
    if (!blob) throw new Error("canvas");
    if (blob.size <= LIMIT) return blob;
  }
  return blob as Blob;
}
