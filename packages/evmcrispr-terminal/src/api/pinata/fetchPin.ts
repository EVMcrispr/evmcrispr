import 'isomorphic-fetch';

type Pin = {
  text: string;
  date: string;
};

const fetchPin = async (
  pinataUrl: string,
  hashId?: string,
): Promise<Pin | null> => {
  if (!hashId) return null;

  const url = pinataUrl + '/ipfs/' + hashId;

  try {
    const response = await fetch(url);

    if (response.status >= 400) {
      throw new Error('Bad response from server');
    }

    return response.json();
  } catch (e) {
    console.log(e);
    throw new Error('Bad response from server');
  }
};

export default fetchPin;
