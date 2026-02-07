import aragon from "../../assets/aragon.svg";
import giveth from "../../assets/giveth.svg";
import OneHive from "../../assets/1hive.svg";
import curve from "../../assets/curve.svg";
import nftx from "../../assets/nftx.svg";

const sponsors = [
  {
    link: "https://aragon.org/",
    src: aragon,
    name: "Aragon",
  },
  {
    link: "https://1hive.org/",
    src: OneHive,
    name: "1hive",
  },
  {
    link: "https://giveth.io",
    src: giveth,
    name: "Giveth",
  },
  {
    link: "https://nftx.io/",
    src: nftx,
    name: "NFTX",
  },
  {
    link: "https://curve.fi/",
    src: curve,
    name: "Curve",
  },
];

export const AllSponsors = () => {
  return (
    <section className="flex justify-center bg-[rgba(24,24,24,1)] p-14">
      <div className="flex flex-col items-center gap-12">
        <h2 className="text-evm-green-300 text-xl font-bold text-center font-head">
          <strong>EVMcrispr</strong> would have not been possible without the
          support of:
        </h2>
        <div className="flex flex-col md:flex-row justify-between items-center w-full lg:w-[956px]">
          {sponsors.map(({ src, link, name }, i) => (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              key={`sponsors-link-${i}`}
            >
              <div className="flex flex-col items-center gap-10 mb-[45px]">
                <img src={src} alt={name} className="w-3/4 md:w-full" />
                <span className="text-white font-head">{name}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
