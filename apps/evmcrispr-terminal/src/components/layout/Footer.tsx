import Blossom from "../../assets/blossom.svg";

const Footer = () => {
  return (
    <div className="flex justify-center py-10">
      <div className="flex flex-col items-center gap-5">
        <span className="text-evm-green-300 font-head">powered by Blossom</span>
        <a
          href="https://github.com/blossomlabs"
          target="_blank"
          rel="noreferrer"
        >
          <img src={Blossom} alt="Blossom" className="h-12" />
        </a>
      </div>
    </div>
  );
};

export default Footer;
