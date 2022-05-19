import { Button } from '@chakra-ui/react';

type Props = {
  onClick?: () => void;
  children: React.ReactNode;
};

const BtnWarning = ({ children, ...props }: Props) => {
  return (
    <Button
      bgColor="brand.btn.warning"
      color="white"
      _hover={{
        color: 'brand.btn.warning',
        bgColor: 'white',
        transition: 'all 0.5s',
      }}
      style={{ cursor: 'default' }}
      padding="10px 20px"
      textDecoration="none"
      fontSize="24px"
      {...props}
    >
      {children}
    </Button>
  );
};

export default BtnWarning;
