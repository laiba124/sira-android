export function formatCount(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Building an Intl formatter is slow on Android, so one is shared and reused.
let dateTimeFormatter: Intl.DateTimeFormat | null = null;

export function formatDateTime(value: string) {
  try {
    dateTimeFormatter ??= new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return value;
  }
}
