import { Button, useToast } from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';

import pinJSON from '../../api/pinata/pinJSON';

type ShareButtonType = {
  onOpen: () => void;
  onClose: () => void;
  script: string;
  setLink: (param: string) => void;
  setUploadStatus: (param: boolean) => void;
};

export default function ShareButton({
  onOpen,
  onClose,
  script,
  setLink,
  setUploadStatus,
}: ShareButtonType) {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  function getRootLocation() {
    const url = window.location.href;
    const urlArr = url.split('/');
    const urlWithoutHash = urlArr.filter((u) => u !== params.hashId);

    return urlWithoutHash.join('/');
  }

  async function handleShare() {
    try {
      setUploadStatus(true);
      onOpen();

      const data = {
        text: script,
        date: new Date().toISOString(),
      };

      const { IpfsHash } = await pinJSON(data);
      const root = params?.hashId ? getRootLocation() : window.location.href;
      const url = root + '/' + IpfsHash;

      setLink(url);
      setUploadStatus(false);

      return navigate(`/terminal/${IpfsHash}`, { replace: true });
    } catch (e: any) {
      setUploadStatus(false);
      onClose();
      toast({
        status: 'error',
        title: 'Error while trying to create sharable link',
        description: e.message,
        duration: 9000,
        isClosable: true,
      });
      console.log(e);
    }
  }

  return (
    <Button onClick={handleShare} variant="blue">
      Share
    </Button>
  );
}
