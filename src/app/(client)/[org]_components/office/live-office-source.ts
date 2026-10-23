function presenceChannel(orgId: string, floorIndex: number, roomId: string) {
  // Colons are forbidden: Centrifugo resolves the namespace before the first
  // `:`, and an undeclared namespace fails with `102: unknown channel`.
  // Base64url-encode the room ID so characters like `:` and `/` are safe.
  const encoded = btoa(roomId)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `office_org_${orgId}_floor_${floorIndex}_room_${encoded}_presence`;
}
