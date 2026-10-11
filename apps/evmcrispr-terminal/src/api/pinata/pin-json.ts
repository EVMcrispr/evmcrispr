import { pin, type Res } from "./pin";

const pinJSON = async (
  data: Record<string, any>,
  metadataName: string,
): Promise<Res> => {
  // A shared script stays within one IPFS block, so that opening the link
  // takes one request for a plain file that can be checked against its CID.
  return pin(
    {
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
    },
    { singleBlock: true },
  );
};

export default pinJSON;
