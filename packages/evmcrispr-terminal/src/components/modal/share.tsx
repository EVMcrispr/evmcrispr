import {
  Center,
  Icon as ChakraIcon,
  HStack,
  Link,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FaLink, FaTelegram, FaTwitter, FaWhatsapp } from 'react-icons/fa';
import styled from '@emotion/styled';

const getSocial = (url: string) => [
  {
    text: 'Share to Twitter',
    Icon: () => (
      <ChakraIcon as={FaTwitter} boxSize={8} color="brand.green.300" />
    ),
    link: () => `https://twitter.com/share?url=${url}`,
  },
  {
    text: 'Share on Whatsapp',
    Icon: () => (
      <ChakraIcon as={FaWhatsapp} boxSize={8} color="brand.green.300" />
    ),
    link: () => `https://api.whatsapp.com/send/?text=${url}`,
  },
  {
    text: 'Share on Telegram',
    Icon: () => (
      <ChakraIcon as={FaTelegram} boxSize={8} color="brand.green.300" />
    ),
    link: () => `https://t.me/share/url?url=${url}`,
  },
  {
    text: 'Copy link',
    Icon: () => <ChakraIcon as={FaLink} boxSize={8} color="brand.green.300" />,
    link: () => url,
    isExternal: false,
    onClick: (toast: (params: Record<string, any>) => void) => {
      navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied to clipboard.',
        status: 'success',
        duration: 9000,
        isClosable: true,
      });
    },
  },
];

const CustomListItem = styled(ListItem)`
  &:hover > * {
    & > * {
      color: ${({ theme }) => theme.colors.gray['900']};
    }
  }
`;

const ShareLinkModal = ({
  isOpen,
  onClose,
  url,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  isLoading: boolean;
}) => {
  const social = getSocial(url);
  const toast = useToast();

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader color="white">Share to...</ModalHeader>
          <ModalCloseButton />
          <ModalBody paddingX={0} paddingBottom={0}>
            {isLoading ? (
              <Center p={4}>
                <Spinner size="xl" color="brand.green.300" />
              </Center>
            ) : (
              <List>
                {social.map(
                  (
                    {
                      text,
                      Icon,
                      link,
                      isExternal = true,
                      onClick = () => true,
                    },
                    i,
                  ) => {
                    return (
                      <Link
                        href={link()}
                        isExternal={isExternal}
                        onClick={() => onClick(toast)}
                        _hover={{
                          textDecoration: 'none',
                        }}
                        key={`share-link-${i}`}
                      >
                        <CustomListItem
                          transitionProperty="all"
                          transitionDuration="0.2"
                          _hover={{
                            backgroundColor: 'brand.green.300',
                          }}
                          paddingX={6}
                          paddingY={3}
                        >
                          <HStack spacing={3}>
                            <Icon />
                            <Text color="white" fontSize="xl">
                              {text}
                            </Text>
                          </HStack>
                        </CustomListItem>
                      </Link>
                    );
                  },
                )}
              </List>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ShareLinkModal;
