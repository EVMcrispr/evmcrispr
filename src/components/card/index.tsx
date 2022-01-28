import Trail from "../animations/trail";

type CardProps = {
  image: any;
  height?: number;
  name: string;
  info: string;
  description: string;
  showContent?: boolean;
};

const Pixels = () => (
  <>
    <span className="card-pixel"></span>
    <span className="card-pixel"></span>
    <span className="card-pixel"></span>
    <span className="card-pixel"></span>
  </>
);

const Card = ({ image, height = 90, name, info, description, showContent }: CardProps) => {
  return (
    <div className="card">
      <div className="card-content">
        <Pixels />
        <Trail open={showContent} className="card-content-wrapper">
          <img src={image} alt={name} height={height} />
          <label className="card-name">{name}</label>
          <label className="card-info">{info}</label>
          <label className="card-description">{description}</label>
        </Trail>
      </div>
      <div className="card-shadow">
        <Pixels />
      </div>
    </div>
  );
};

export default Card;
