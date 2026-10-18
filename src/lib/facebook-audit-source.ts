const RAYGINE_PAGE = "https://www.facebook.com/Raygine/";

export function facebookAuditSource(companyName: string, socialHandles: string | null): string | null {
  const handle = socialHandles?.match(/https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._-]+\/?/i)?.[0];
  if (handle) return handle.replace("https://facebook.com/", "https://www.facebook.com/");
  return /raygine/i.test(companyName) ? RAYGINE_PAGE : null;
}