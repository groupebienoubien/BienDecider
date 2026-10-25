const RAYGINE_PAGE = "https://www.facebook.com/Raygine/";

/** Page à auditer : le lien confirmé par le dirigeant d'abord, puis celui qu'il a déclaré. */
export function facebookAuditSource(companyName: string, socialHandles: string | null, confirmedUrl?: string | null): string | null {
  if (confirmedUrl) return confirmedUrl;
  const handle = socialHandles?.match(/https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+\/?/i)?.[0];
  if (handle) return handle.replace("https://facebook.com/", "https://www.facebook.com/");
  return /raygine/i.test(companyName) ? RAYGINE_PAGE : null;
}
