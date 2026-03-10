import Blossom from "../../assets/blossom.svg";

const Footer = () => {
  return (
    <div className="flex justify-center py-4">
      <div className="flex flex-col items-center gap-2">
        <span className="text-evm-green-300 font-head text-sm">
          built by{" "}
          <a href="https://blossom.software" target="_blank" rel="noreferrer">
            blossom
          </a>
        </span>
        <a href="https://blossom.software" target="_blank" rel="noreferrer">
          <img src={Blossom} alt="Blossom" className="h-6" />
        </a>
      </div>
    </div>
  );
};

export default Footer;
