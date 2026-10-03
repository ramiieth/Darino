/** Compatibility for saved links; all portfolio activity lives in the dashboard. */
import { Navigate } from 'react-router-dom';
export default function NetworkPortfolioPage(){return <Navigate to="/dashboard?view=activity" replace/>;}
