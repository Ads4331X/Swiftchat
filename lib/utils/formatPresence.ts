export function formatPresence(lastSeen: string | null | undefined) {
  if (lastSeen === null) return "Online";
  if (!lastSeen) return "Offline";

  const lastSeenDate = new Date(lastSeen);

  if (Number.isNaN(lastSeenDate.getTime())) return "Offline";

  if (Date.now() - lastSeenDate.getTime() < 2 * 60 * 1000) {
    return "Online";
  }

  return `Last Seen ${lastSeenDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}, ${lastSeenDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
