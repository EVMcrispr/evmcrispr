import Trail from "../animations/Trail";

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
    <span className="absolute -top-[5px] -right-[5px] w-2 h-2 bg-black block" />
    <span className="absolute -bottom-[5px] -right-[5px] w-2 h-2 bg-black block" />
    <span className="absolute -top-[5px] -left-[5px] w-2 h-2 bg-black block" />
    <span className="absolute -bottom-[5px] -left-[5px] w-2 h-2 bg-black block" />
  </>
);

const Card = ({
  image,
  height = 130,
  name,
  info,
  description,
  showContent,
}: CardProps) => {
  return (
    <div className="w-[255px] relative">
      <div className="min-h-[470px] p-6 text-center border-4 border-evm-green-300 bg-black z-10 relative">
        <Pixels />
        <Trail open={showContent}>
          <div className="flex flex-col items-center gap-2 overflow-hidden">
            <div className="h-[160px] flex items-center justify-center">
              <img src={image} alt={name} style={{ height }} />
            </div>
            <span className="text-[15px] text-evm-green-300 font-bold font-head">
              {name}
            </span>
            <span className="text-[15px] font-bold font-clearer text-white">
              {info}
            </span>
            <span className="text-[13px] font-clearer text-white">
              {description}
            </span>
          </div>
        </Trail>
      </div>
      <div className="absolute inset-0 translate-x-[25px] translate-y-[25px] border-4 border-evm-green-300">
        <Pixels />
      </div>
    </div>
  );
};

export default Card;
