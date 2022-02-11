import { Switch, Route, HashRouter , Redirect} from "react-router-dom";
import Footer from "./components/footer";
import Header from "./components/header";

import Landing from "./pages/landing";
import Terminal from "./pages/terminal";

const App = () => {
  return (
    <div className="App">
      <HashRouter>
        <Header />
        <Switch>
          <Route exact path="/terminal" render={() => <Terminal />} />
          <Route exact path="/" render={() => <Landing />} />
          <Redirect to="/" />
        </Switch>
        <Footer />
      </HashRouter>
    </div>
  );
};

export default App;
