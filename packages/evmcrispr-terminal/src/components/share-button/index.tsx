import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon, IconButton, useDisclosure, useToast } from '@chakra-ui/react';
import { ShareIcon } from '@heroicons/react/24/solid';

import ShareModal from '../share-modal';
import pinJSON from '../../api/pinata/pinJSON';

export default function ShareButton({
  script,
  savedScript,
}: {
  script: string;
  savedScript?: string;
}) {
  const [link, setLink] = useState('');
  const [isUploading, setUploadStatus] = useState(false);
  const {
    isOpen: isShareModalOpen,
    onOpen: onShareModalOpen,
    onClose: onShareModalClose,
  } = useDisclosure({
    id: 'share',
  });

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
      if (savedScript === script) {
        onShareModalOpen();
        return;
      }

      setUploadStatus(true);
      onShareModalOpen();

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
      onShareModalClose();
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
    <>
      <IconButton
        icon={<Icon as={ShareIcon} />}
        aria-label={'Share link'}
        variant={'outline'}
        onClick={handleShare}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={onShareModalClose}
        isLoading={isUploading}
        url={link}
      />
    </>
  );
}
