type CardProps = {
  image: any;
  name: string;
  info: string;
  description: string;
};

const Card = ({ image, name, info, description }: CardProps) => {
  return (
    <div className="card">
      <div className="card-content">
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>

        <img src={image} alt={name} height="90" />
        <label className="card-name">{name}</label>
        <label className="card-info">{info}</label>
        <label className="card-description">{description}</label>
      </div>
      <div className="card-shadow">
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>
        <span className="card-pixel"></span>
      </div>
    </div>
  );
};

export default Card;
