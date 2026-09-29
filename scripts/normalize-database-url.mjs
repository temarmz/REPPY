export function normalizeDatabaseUrl(value) {
  let candidate = value.trim();
  const quote = candidate[0];
  if ((quote === '"' || quote === "'") && candidate.at(-1) === quote) {
    candidate = candidate.slice(1, -1).trim();
  }

  const match = candidate.match(/^(postgres(?:ql)?):\/\/([^:/@]+):([\s\S]*)@([^@\s]+)$/i);
  if (match) {
    const [, protocol, username, password, target] = match;
    let decodedPassword = password;
    try {
      decodedPassword = decodeURIComponent(password);
    } catch {
      // A raw percent sign is part of the password and must be encoded below.
    }
    return new URL(`${protocol}://${username}:${encodeURIComponent(decodedPassword)}@${target}`);
  }

  return new URL(candidate);
}
