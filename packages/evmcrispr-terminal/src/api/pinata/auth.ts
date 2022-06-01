import 'isomorphic-fetch';

const pinataAuth = async (pinataUrl: string) => {
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
  const url = pinataUrl + '/data/testAuthentication';

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
    });

    if (response.status >= 400) {
      throw new Error('Bad response from server');
    }

    return response.json();
  } catch (e) {
    console.log(e);
    throw new Error('Bad response from server');
  }
};

export default pinataAuth;
