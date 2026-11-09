import assert from "node:assert/strict";
import test from "node:test";
import { VISUAL_PHOTO_MAX_BYTES, checkVisualPhoto, cleanVisualPhotoAlt, readVisualPhoto, rightsRequired, visualPhotoPathname } from "../src/lib/brand/photo.ts";
import { renderVisual } from "../src/lib/brand/render.ts";

function png(width, height, extra = 0) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 0, 0, 0, 0, 0, 8, 2, 0, 0, 0]);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return new Uint8Array(Buffer.concat([header, Buffer.alloc(extra)]));
}

test("une photo valide passe : type réel, dimensions lues dans l'en-tête", () => {
  const check = checkVisualPhoto(png(800, 600));
  assert.equal(check.ok, true);
  assert.deepEqual([check.width, check.height, check.type.mime], [800, 600, "image/png"]);
});

test("une photo de plus de 1 Mo est refusée avant tout autre contrôle", () => {
  const check = checkVisualPhoto(png(800, 600, VISUAL_PHOTO_MAX_BYTES));
  assert.deepEqual([check.ok, check.status], [false, 413]);
  assert.match(check.error, /1 Mo/);
});

test("un fichier qui n'est pas une image est refusé, quel que soit son nom", () => {
  const check = checkVisualPhoto(new TextEncoder().encode("<svg onload=alert(1)></svg>"));
  assert.deepEqual([check.ok, check.status], [false, 415]);
  assert.equal(checkVisualPhoto(new Uint8Array(0)).ok, false);
});

test("une image illisible ou démesurée est refusée", () => {
  assert.equal(checkVisualPhoto(png(0, 0)).ok, false);
  assert.equal(checkVisualPhoto(png(4000, 3000)).status, 413);
});

test("le texte alternatif est obligatoire, sans balise, 200 caractères au plus", () => {
  assert.equal(cleanVisualPhotoAlt("  Notre   salle <b>refaite</b>  ")?.match(/[<>]/), null);
  assert.equal(cleanVisualPhotoAlt("  Notre   salle  refaite "), "Notre salle refaite");
  assert.equal(cleanVisualPhotoAlt(""), null);
  assert.equal(cleanVisualPhotoAlt("   "), null);
  assert.equal(cleanVisualPhotoAlt("x".repeat(201)), null);
  assert.equal(cleanVisualPhotoAlt(12), null);
});

test("la photo d'une version doit venir du dossier de son entreprise", () => {
  const photo = { url: "https://blob.example/a.jpg", pathname: visualPhotoPathname("co1", "ct1", "id1", { extension: "jpg" }), alt: "Salle", width: 10, height: 10 };
  assert.deepEqual(readVisualPhoto(photo, "co1"), photo);
  assert.equal(readVisualPhoto(photo, "co2"), null);
  assert.equal(readVisualPhoto({ ...photo, url: "http://blob.example/a.jpg" }, "co1"), null);
  assert.equal(readVisualPhoto({ ...photo, url: "javascript:alert(1)" }, "co1"), null);
  assert.equal(readVisualPhoto(null, "co1"), null);
});

test("les droits ne sont demandés que pour une version qui porte une photo", () => {
  assert.equal(rightsRequired(null), false);
  assert.equal(rightsRequired({ url: "https://x", pathname: "p", alt: "a", width: 1, height: 1 }), true);
});

test("la description de la photo accompagne le visuel, et seulement avec une photo", () => {
  const base = { composition: "photo_signature", primary: "#1f5f4a", accent: "#e0a030", tone: "clair", headline: "Accroche", signature: "Entreprise" };
  assert.ok(renderVisual({ ...base, photoUrl: "https://blob.example/a.jpg", photoAlt: "Salle de bains" }).includes("Photo : Salle de bains"));
  assert.ok(!renderVisual({ ...base, photoAlt: "Salle de bains" }).includes("Salle de bains"));
});
