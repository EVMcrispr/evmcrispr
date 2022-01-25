import { Children } from "react";
import { useTrail, a } from "@react-spring/web";

type TrailType = {
  children: React.ReactNode;
  open?: boolean;
  className?: any;
};

function Trail ({ open, children, className }: TrailType) {
  const items = Children.toArray(children)
  const trail = useTrail(items.length, {
    config: {
      mass: 5,
      tension: 2000,
      friction: 200,
      duration: 500
    },
    opacity: open ? 1 : 0,
    filter: open ? 'blur(0)' : 'blur(30px)',
    from: { opacity: 0, filter: 'blur(0)' },
  })
  return (
    <div className={className}>
      {trail.map(({ ...style }, index) => (
        <a.div key={index} style={style}>
          {items[index]}
        </a.div>
      ))}
    </div>
  )
}

export default Trail;

