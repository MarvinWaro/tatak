/**
 * Shrinks a picture in the browser before upload, so logos stay small (about 10–60 KB).
 * Returns a data URL, or throws with a message the person can act on.
 */
export async function resizeLogo(file: File, maxSide = 256): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("Use a PNG, JPG or WebP picture.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That picture couldn't be opened. Try another one."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

    // WebP keeps transparency and is small; browsers that can't make WebP give PNG instead.
    let dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (dataUrl.length > 190_000) dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 190_000) throw new Error("That picture is too detailed. Try a simpler logo.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
