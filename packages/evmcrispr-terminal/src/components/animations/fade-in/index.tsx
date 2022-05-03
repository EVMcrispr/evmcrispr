import { animated, easings, useSpring } from "@react-spring/web";

type FadeInType = {
  children: React.ReactNode;
  componentRef?: any;
  onRest?: () => void;
};

function FadeIn({ children, componentRef, onRest = () => {} }: FadeInType) {
  const styles = useSpring({
    ref: componentRef,
    loop: false,
    delay: 100,
    to: { opacity: 1 },
    from: { opacity: 0 },
    onRest: () => onRest(),
    config: {
      duration: 400,
      easing: easings.easeInOutQuart
    }
  });

  return <animated.div style={styles}>{children}</animated.div>
}

export default FadeIn;

