import { Switch, Route, BrowserRouter } from "react-router-dom";

import Landing from "./pages/landing";
import Terminal from "./pages/terminal";

const App = () => {
  return (
    <div className="App">
      <BrowserRouter>
        <Switch>
          <Route exact path="/terminal" render={() => <Terminal />} />
          <Route exact path="/" render={() => <Landing />} />
        </Switch>
      </BrowserRouter>
    </div>
  );
};

export default App;
