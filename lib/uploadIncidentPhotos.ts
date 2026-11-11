import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import { supabase } from "./supabase";

function getExtension(asset: ImagePickerAsset) {
  const fromName = asset.fileName?.split(".").pop()?.toLowerCase();

  if (fromName && ["jpg", "jpeg", "png", "webp", "heic"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (asset.mimeType?.includes("png")) return "png";
  if (asset.mimeType?.includes("webp")) return "webp";
  if (asset.mimeType?.includes("heic")) return "heic";

  return "jpg";
}

function getContentType(asset: ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;

  const ext = getExtension(asset);

  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";

  return "image/jpeg";
}

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
}

export async function uploadIncidentPhotos(
  incidentId: string,
  assets: ImagePickerAsset[]
) {
  if (assets.length > 2) {
    throw new Error("A maximum of 2 incident pictures is allowed.");
  }

  const urls: string[] = [];

  for (const [index, asset] of assets.entries()) {
    const ext = getExtension(asset);
    const contentType = getContentType(asset);

    const baseName = cleanFileName(asset.fileName ?? `photo-${index}`);
    const storagePath = `${incidentId}/${Date.now()}-${index}-${baseName}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileBody = decode(base64);

    const { data, error } = await supabase.storage
      .from("incident-photos")
      .upload(storagePath, fileBody, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data: publicData } = supabase.storage
      .from("incident-photos")
      .getPublicUrl(data.path);

    urls.push(publicData.publicUrl);
  }

  return urls;
}

