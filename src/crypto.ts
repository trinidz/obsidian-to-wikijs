async function sha (algorithm: string, data: string | ArrayBuffer) {
  let uint8Array
  if (typeof data === 'string') {
    const encoder = new TextEncoder()
    uint8Array = encoder.encode(data)
  } else {
    uint8Array = data
  }
  const hash = await crypto.subtle.digest(algorithm, uint8Array)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256 (data: string | ArrayBuffer) {
  return sha('SHA-256', data)
}

export async function sha1 (data: string | ArrayBuffer) {
  return sha('SHA-1', data)
}

export async function shortHash (text: string) {
  return (await sha256(text)).slice(0, 32)
}