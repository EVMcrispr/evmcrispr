const fetchPin = async (
  pinataUrl: string,
  hashId?: string,
): Promise<string | undefined> => {
  if (!hashId) return undefined;

  const url = `${pinataUrl}/ipfs/${hashId}`;

  try {
    const response = await fetch(url);

    if (response.status >= 400) {
      throw new Error("Bad response from server");
    }

    return response.text();
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default fetchPin;
