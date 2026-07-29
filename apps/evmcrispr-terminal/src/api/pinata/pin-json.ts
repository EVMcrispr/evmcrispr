type Res = {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
};

const pinJSON = async (
  data: Record<string, any>,
  metadataName: string,
): Promise<Res> => {
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        pinataOptions: {
          cidVersion: 0,
        },
        pinataMetadata: {
          name: metadataName,
          keyvalues: {
            type: "evmcripsr/json",
            version: "0.11",
          },
        },
        pinataContent: data,
      }),
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status >= 400) {
      throw new Error("Bad response from server");
    }

    return response.json();
  } catch (_e) {
    throw new Error("Bad response from server");
  }
};

export default pinJSON;
