import { useNavigate } from 'react-router-dom';
import { Icon, IconButton, Tooltip } from '@chakra-ui/react';
import { ShareIcon } from '@heroicons/react/24/solid';

import { useEffect, useState } from 'react';

import pinJSON from '../../api/pinata/pinJSON';

type ShareButtonProps = {
  script: string;
  title: string;
};

export default function ShareButton({ script, title }: ShareButtonProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    setUrl('');
  }, [script]);

  async function handleShare() {
    const data = {
      title,
      script,
    };

    setLoading(true);
    const { IpfsHash: hash } = await pinJSON(data);

    setUrl(`${window.location.origin}/terminal/${hash}`);
    navigator.clipboard.writeText(`${window.location.origin}/terminal/${hash}`);
    setLoading(false);
    return navigate(`/terminal/${hash}`, { replace: true });
  }

  return (
    <>
      <Tooltip
        label={
          title
            ? url
              ? 'Link copied to clipboard!'
              : 'Generate link'
            : 'The script needs a title first'
        }
        variant={title ? '' : 'warning'}
        closeOnClick={false}
        placement="top"
      >
        <IconButton
          icon={<Icon as={ShareIcon} />}
          aria-label={'Share script'}
          variant={'outline-overlay'}
          onClick={handleShare}
          size={'md'}
          isLoading={isLoading}
          disabled={!!url || !title}
        />
      </Tooltip>
    </>
  );
}
