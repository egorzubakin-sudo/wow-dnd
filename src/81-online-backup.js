const atlasStorageReference = "atlas-storage:v1:";
const atlasMediaTypes = "png|jpeg|webp|gif|bmp|avif";
const atlasMediaName = new RegExp("^[a-f0-9]{64}\\.(" + atlasMediaTypes + ")$");
const atlasImagePattern = new RegExp("^data:image/(" + atlasMediaTypes + ");base64,([A-Za-z0-9+/=]+)$", "i");

function mapBackupValues(value, visit) {
  if (Array.isArray(value)) return value.map((entry) => mapBackupValues(entry, visit));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapBackupValues(entry, visit)]));
  return typeof value === "string" ? visit(value) : value;
}

async function splitOnlineBackup(raw, { allowReferences = false } = {}) {
  validateBackup(raw);
  const dataUrls = new Set();
  mapBackupValues(raw, (value) => {
    requireThat(allowReferences || !value.startsWith(atlasStorageReference), "Загрузите исходный экспорт Атласа с изображениями");
    if (/^data:image\//i.test(value)) dataUrls.add(value);
    return value;
  });
  const images = new Map(), references = new Map();
  for (const url of dataUrls) {
    const [, extension, base64] = atlasImagePattern.exec(url) || [];
    requireThat(extension, "В сохранении есть изображение неподдерживаемого формата");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    requireThat(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024, "Размер изображения должен быть от 1 байта до 20 МиБ");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2,"0")).join("");
    const name = hash + "." + extension.toLowerCase();
    references.set(url, atlasStorageReference + name);
    images.set(name, new Blob([bytes], { type: "image/" + extension.toLowerCase() }));
  }
  const document = mapBackupValues(raw, (value) => references.get(value) || value);
  requireThat(new TextEncoder().encode(JSON.stringify(document)).length <= 8 * 1024 * 1024,
    "JSON без изображений превышает 8 МиБ");
  return { document, images };
}

async function joinOnlineBackup(document, download) {
  const names = new Set(), images = new Map();
  mapBackupValues(document, (value) => {
    if (!value.startsWith(atlasStorageReference)) return value;
    const name = value.slice(atlasStorageReference.length);
    requireThat(atlasMediaName.test(name), "Некорректная ссылка на изображение");
    names.add(name);
    return value;
  });
  for (const name of names) images.set(name, await download(name));
  return mapBackupValues(document, (value) =>
    value.startsWith(atlasStorageReference) ? images.get(value.slice(atlasStorageReference.length)) : value);
}
