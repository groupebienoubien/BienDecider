"use client";

import { useState } from "react";
import {
  SITE_PHOTO_ALT_MAX,
  SITE_PHOTO_BAD_TYPE,
  SITE_PHOTO_MAX_BYTES,
  SITE_PHOTO_MAX_COUNT,
  SITE_PHOTO_MAX_SIDE,
  SITE_PHOTO_TOO_LARGE,
  SITE_PHOTO_TOO_MANY,
  SITE_PHOTO_UNAVAILABLE,
} from "@/lib/site/photos";

export type SitePhotoItem = { id: string; url: string; alt: string; width: number; height: number };

type Status = { tone: "notice" | "warning"; text: string; link?: string } | null;

/** Redimensionnement dans le navigateur avant envoi : plus grand côté 1600 px, en WebP. */
async function resizeForSite(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SITE_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // Un navigateur sans encodeur WebP rend du PNG : on réessaie alors en JPEG.
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("canvas");
  return jpeg;
}

type ReviewPoint = { id: string; title: string; detail: string };

async function errorText(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/**
 * Section « Photos du site » (story 5.5) : le dirigeant ajoute jusqu'à 8 photos, les décrit, les retire.
 * Rien n'est publié à l'ajout : la page publique ne change qu'après « Republier avec les photos ».
 */
export function SitePhotos({ initialPhotos, available, siteSlug }: { initialPhotos: SitePhotoItem[]; available: boolean; siteSlug: string | null }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState<"upload" | "republish" | string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [reviewPoints, setReviewPoints] = useState<ReviewPoint[]>([]);
  const full = photos.length >= SITE_PHOTO_MAX_COUNT;

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus({ tone: "warning", text: "Choisissez une photo à envoyer." });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ tone: "warning", text: SITE_PHOTO_BAD_TYPE });
      return;
    }
    setBusy("upload");
    setStatus(null);
    try {
      let resized: Blob;
      try {
        resized = await resizeForSite(file);
      } catch {
        setStatus({ tone: "warning", text: SITE_PHOTO_BAD_TYPE });
        return;
      }
      if (resized.size > SITE_PHOTO_MAX_BYTES) {
        setStatus({ tone: "warning", text: SITE_PHOTO_TOO_LARGE });
        return;
      }
      const body = new FormData();
      body.set("file", resized, resized.type === "image/webp" ? "photo.webp" : "photo.jpg");
      body.set("alt", String(data.get("alt") ?? ""));
      const response = await fetch("/api/site/photos", { method: "POST", body });
      if (!response.ok) {
        setStatus({ tone: "warning", text: await errorText(response, "La photo n’a pas pu être enregistrée. Réessayez.") });
        return;
      }
      const { photo } = await response.json() as { photo: SitePhotoItem };
      setPhotos((current) => [...current, photo]);
      form.reset();
      setStatus({ tone: "notice", text: siteSlug ? "Photo ajoutée. Elle apparaîtra sur votre site après « Republier avec les photos »." : "Photo ajoutée. Elle apparaîtra sur votre site à sa mise en ligne." });
    } catch {
      setStatus({ tone: "warning", text: "La photo n’a pas pu être enregistrée. Réessayez." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(photo: SitePhotoItem) {
    setBusy(photo.id);
    setStatus(null);
    try {
      const response = await fetch(`/api/site/photos/${photo.id}`, { method: "DELETE" });
      if (!response.ok) {
        setStatus({ tone: "warning", text: await errorText(response, "La photo n’a pas pu être retirée. Réessayez.") });
        return;
      }
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      setStatus({ tone: "notice", text: siteSlug ? "La photo est retirée tout de suite, y compris de votre site publié ; republiez pour remettre la page en forme." : "Photo retirée." });
    } catch {
      setStatus({ tone: "warning", text: "La photo n’a pas pu être retirée. Réessayez." });
    } finally {
      setBusy(null);
    }
  }

  async function saveAlt(event: React.FormEvent<HTMLFormElement>, photo: SitePhotoItem) {
    event.preventDefault();
    const alt = String(new FormData(event.currentTarget).get("alt") ?? "");
    setBusy(photo.id);
    setStatus(null);
    try {
      const response = await fetch(`/api/site/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt }),
      });
      if (!response.ok) {
        setStatus({ tone: "warning", text: await errorText(response, "La description n’a pas pu être enregistrée. Réessayez.") });
        return;
      }
      const { photo: updated } = await response.json() as { photo: SitePhotoItem };
      setPhotos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus({ tone: "notice", text: siteSlug ? "Description enregistrée. Republiez pour l’appliquer à votre site." : "Description enregistrée." });
    } catch {
      setStatus({ tone: "warning", text: "La description n’a pas pu être enregistrée. Réessayez." });
    } finally {
      setBusy(null);
    }
  }

  async function republish(acknowledgedReviewIds: string[] = []) {
    setBusy("republish");
    setStatus(null);
    try {
      const response = await fetch("/api/site/republish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedReviewIds }),
      });
      const body = await response.json().catch(() => null) as { error?: string; message?: string; url?: string; reviewPoints?: ReviewPoint[] } | null;
      if (!response.ok) {
        setReviewPoints(Array.isArray(body?.reviewPoints) ? body.reviewPoints : []);
        setStatus({ tone: "warning", text: body?.error ?? "Le site n’a pas pu être republié. Réessayez dans un instant." });
        return;
      }
      setReviewPoints([]);
      setStatus({ tone: "notice", text: body?.message ?? "Site republié.", link: body?.url });
    } catch {
      setStatus({ tone: "warning", text: "Le site n’a pas pu être republié. Réessayez dans un instant." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="photos-site" className="setting-section site-photos-section" aria-labelledby="photos-site-title">
      <h2 id="photos-site-title">Photos du site</h2>
      <p>Montrez vos réalisations : {SITE_PHOTO_MAX_COUNT} photos au plus, JPG, PNG ou WebP, 5 Mo au plus chacune. Décrivez chaque photo en quelques mots.</p>
      {!available && <p role="status" className="warning">{SITE_PHOTO_UNAVAILABLE}</p>}
      {photos.length > 0 && (
        <ul className="site-photos" aria-label="Photos de votre site">
          {photos.map((photo) => (
            <li key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- photo déjà redimensionnée, servie telle quelle par le stockage */}
              <img src={photo.url} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" />
              <form onSubmit={(event) => saveAlt(event, photo)}>
                <label className="field">Description
                  <input name="alt" defaultValue={photo.alt} maxLength={SITE_PHOTO_ALT_MAX} placeholder="Ex. : salle de bain rénovée à Nantes" />
                </label>
                <button type="submit" className="text-link" disabled={busy !== null}>Enregistrer la description</button>
              </form>
              <button type="button" className="text-link" onClick={() => remove(photo)} disabled={busy !== null || !available}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
      {available && (full ? <p>{SITE_PHOTO_TOO_MANY} Retirez-en une pour en ajouter une autre.</p> : (
        <form onSubmit={upload}>
          <label className="field">Photo
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <label className="field">Description
            <input name="alt" maxLength={SITE_PHOTO_ALT_MAX} placeholder="Ex. : terrasse en bois livrée en juin" />
          </label>
          <button type="submit" disabled={busy !== null}>{busy === "upload" ? "Envoi…" : "Ajouter la photo"}</button>
        </form>
      ))}
      {siteSlug && (
        <>
          <p>Votre site est en ligne. Les photos ajoutées n’y apparaissent qu’après republication, qui compte comme un lancement.</p>
          {reviewPoints.length === 0 && (
            <button type="button" className="primary" onClick={() => republish()} disabled={busy !== null}>{busy === "republish" ? "Republication…" : "Republier avec les photos"}</button>
          )}
        </>
      )}
      {siteSlug && reviewPoints.length > 0 && (
        <section aria-label="Points à confirmer avant republication">
          <p><strong>À vérifier avant republication</strong></p>
          {reviewPoints.map((point) => (
            <div key={point.id}>
              <p><strong>{point.title}</strong></p>
              {point.detail && <p>{point.detail}</p>}
            </div>
          ))}
          <button type="button" className="primary" onClick={() => republish(reviewPoints.map((point) => point.id))} disabled={busy !== null}>{busy === "republish" ? "Republication…" : "J’ai vérifié, republier"}</button>
        </section>
      )}
      {status && (
        <p role={status.tone === "warning" ? "alert" : "status"} className={status.tone}>
          {status.text}
          {status.link && <> <a href={status.link} target="_blank" rel="noopener noreferrer">Voir la page publique</a></>}
        </p>
      )}
    </section>
  );
}
