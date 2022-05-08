import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';

import Wagmi from './providers/Wagmi';

import Footer from './components/footer';
import Header from './components/header';

import Landing from './pages/landing';
import Terminal from './pages/terminal';

const App = () => {
  return (
    <div className="App">
      <Wagmi>
        <HashRouter>
          <Header />
          <Switch>
            <Route exact path="/terminal" render={() => <Terminal />} />
            <Route exact path="/" render={() => <Landing />} />
            <Redirect to="/" />
          </Switch>
          <Footer />
        </HashRouter>
      </Wagmi>
    </div>
  );
};

export default App;
