import React from "react";
import sponsor from "../../assets/sponsor.svg";
import Bee from "../../assets/bee.svg";

type PageSkeletonProps = {
  children: React.ReactNode;
};

const PageSkeleton = ({ children }: PageSkeletonProps) => {
  return (
    <>
      {children}

      <div className="sponsors flex-center ">
        <label htmlFor="">Sponsored by</label>
        <div>
          <img src={sponsor} alt="Sponsor" height="58px" />
        </div>
      </div>

      <footer className="flex-center ">
        <label htmlFor="">powered by Bees</label>
        <div>
          <img src={Bee} alt="Bee" height="48px"></img>
        </div>
      </footer>
    </>
  );
};

export default PageSkeleton;
