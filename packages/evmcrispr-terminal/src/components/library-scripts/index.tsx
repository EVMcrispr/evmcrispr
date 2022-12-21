import { Link, useNavigate, useParams } from 'react-router-dom';
import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { Search2Icon } from '@chakra-ui/icons';
import { StarIcon, TrashIcon } from '@heroicons/react/24/solid';

export type Script = {
  title: string;
  date: Date;
  hashId: string;
};

function getDate(date: Date) {
  const parsedDate = new Date(date);

  return {
    month: parsedDate
      .toLocaleString('default', { month: 'short' })
      .split('.')[0],
    day: parsedDate.getUTCDate(),
    year: parsedDate.getUTCFullYear(),
  };
}

function SavedScript({
  title,
  date,
  hashId,
  setScripts,
}: Script & { setScripts: React.Dispatch<React.SetStateAction<Script[]>> }) {
  const navigate = useNavigate();
  const params = useParams();
  const { day, month, year } = getDate(date);

  function handleRemoveScript() {
    const savedScripts = localStorage.getItem('savedScripts');
    if (!savedScripts) return;

    const filteredScripts = JSON.parse(savedScripts).filter(
      (s: Script) => s.hashId !== hashId,
    );
    setScripts(filteredScripts);
    localStorage.setItem('savedScripts', JSON.stringify(filteredScripts));

    return params?.hashId === hashId
      ? navigate('/terminal', { replace: true })
      : navigate(`/terminal/${params?.hashId}`, { replace: true });
  }

  return (
    <Box bgColor={'brand.gray.800'} p={5} position={'relative'} w={'full'}>
      <Link to={`/terminal/${hashId}`}>
        <VStack spacing={3} align={'flex-start'}>
          <Text fontSize={'3xl'} color={'brand.yellow.300'}>
            {title}
          </Text>
          <Text color={'white'} fontSize={'md'}>
            Created{' '}
            <span style={{ textTransform: 'capitalize' }}>{month} </span>
            {day}, {year}
          </Text>
        </VStack>
      </Link>
      <IconButton
        aria-label="Remove saved script"
        icon={<Icon as={TrashIcon} />}
        variant={'outline'}
        position={'absolute'}
        right={'10px'}
        bottom={'10px'}
        size={'xs'}
        onClick={handleRemoveScript}
      />
    </Box>
  );
}

function getInitialScripts() {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return [];
  return JSON.parse(savedScripts);
}

const Bookmark = (props: { top: string }) => (
  <Box
    h={12}
    w={8}
    boxSizing={'border-box'}
    position={'relative'}
    bgColor={'brand.green.300'}
    _before={{
      boxSizing: 'border-box',
      borderBottom: '7px solid',
      borderColor: 'brand.green.800',
      content: '""',
      display: 'block',
      height: '100%',
      position: 'absolute',
      width: '70%',
      top: '8px',
      left: '6px',
    }}
    {...props}
  />
);

function Markers() {
  return (
    <Box position={'relative'} right={8} h={0}>
      <Bookmark top={'10vh'} />
      <Bookmark top={'75vh'} />
    </Box>
  );
}

export default function LibraryScripts() {
  const [scripts, setScripts] = useState<Script[]>(getInitialScripts());
  const [filteredScripts, setFilteredScripts] = useState<Script[]>(scripts);
  const { isOpen, onClose, onToggle } = useDisclosure();
  const btnRef = useRef(null);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const filterScripts = scripts.filter(({ title }) =>
      title.includes(e.target.value),
    );
    return setFilteredScripts(filterScripts);
  }

  return (
    <>
      <Box
        position={'fixed'}
        zIndex={10000}
        right={isOpen ? { base: '318px', sm: '446px' } : 0}
        transition={isOpen ? 'right 450ms ease' : ''}
        transform={'rotate(-90deg)'}
        transformOrigin={'bottom right'}
        top={{ base: '170px', md: '275px', '2xl': '150px' }}
      >
        <Button
          variant={'outline'}
          colorScheme={'yellow'}
          rightIcon={
            <Icon as={StarIcon} boxSize={6} color={'brand.yellow.300'} />
          }
          size={'md'}
          color={'white'}
          ref={btnRef}
          onClick={() => {
            setScripts(getInitialScripts());
            setFilteredScripts(getInitialScripts());
            onToggle();
          }}
        >
          Library
        </Button>
      </Box>
      <Drawer
        isOpen={isOpen}
        placement="right"
        onClose={onClose}
        finalFocusRef={btnRef}
        size={{ base: 'xs', sm: 'sm' }}
      >
        <DrawerContent
          bgColor={'brand.gray.700'}
          borderLeft={'2px solid'}
          borderColor={'brand.green.300'}
        >
          <Markers />
          <DrawerHeader py={6}>
            <VStack spacing={4}>
              <HStack justify={'center'} align={'center'} spacing={4}>
                <Text color={'white'} fontSize={'4xl'}>
                  My Library
                </Text>
                <Icon as={StarIcon} color={'brand.yellow.300'} boxSize={10} />
              </HStack>
              <InputGroup>
                <Input
                  border={'1px solid'}
                  borderColor={'brand.green.300'}
                  placeholder={'Search'}
                  color={'white'}
                  p={2.5}
                  borderRadius={'none'}
                  fontSize={'2xl'}
                  _placeholder={{
                    color: 'white',
                  }}
                  onChange={handleInputChange}
                />
                <InputRightElement>
                  <IconButton
                    icon={<Search2Icon />}
                    aria-label={'Search scripts'}
                    size={'sm'}
                    variant={'solid'}
                    colorScheme={'green'}
                  />
                </InputRightElement>
              </InputGroup>
            </VStack>
          </DrawerHeader>

          <DrawerBody px={2}>
            <VStack spacing={2}>
              {filteredScripts.length > 0 ? (
                filteredScripts.map((s) => (
                  <SavedScript
                    {...s}
                    setScripts={(e) => {
                      setScripts(e);
                      setFilteredScripts(e);
                    }}
                    key={s.hashId}
                  />
                ))
              ) : (
                <Text fontSize={'2xl'} color={'brand.yellow.300'}>
                  No scripts saved yet.
                </Text>
              )}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
