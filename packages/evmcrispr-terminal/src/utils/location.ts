export function getRootLocation(hashId?: string) {
  const url = window.location.href;
  const urlArr = url.split('/');
  const urlWithoutHash = urlArr.filter((u) => u !== hashId);

  return urlWithoutHash.join('/');
}
