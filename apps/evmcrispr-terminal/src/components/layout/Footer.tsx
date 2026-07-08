import Blossom from "../../assets/blossom.svg";

const Footer = () => {
  return (
    <div className="flex items-center justify-center gap-2 py-4 px-6">
      <a href="https://blossom.software" target="_blank" rel="noreferrer">
        <img src={Blossom} alt="Blossom" className="h-4" />
      </a>
      <span className="text-evm-green-300 font-head text-sm">
        built by{" "}
        <a href="https://blossom.software" target="_blank" rel="noreferrer">
          blossom
        </a>
      </span>
    </div>
  );
};

export default Footer;
