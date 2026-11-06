import Cookies from 'js-cookie';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const authToken = Cookies.get('authToken');

  if (!authToken) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
