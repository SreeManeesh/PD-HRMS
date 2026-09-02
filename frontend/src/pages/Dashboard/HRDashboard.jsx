import MainLayout from "../../components/layout/MainLayout.jsx";
import WelcomeCard from "../../components/shared/Dashboardgreeting.jsx";
import AlertCard from "../../components/dashboard/AlertCard.jsx";
import HiringInsights from "../../components/dashboard/HiringInsights.jsx";
import QuickActions from "../../components/dashboard/QuickActions.jsx";
import PeopleCard from "../../components/dashboard/PeopleCard.jsx";
import PayrollCard from "../../components/dashboard/PayrollCard.jsx";
import ResourcesCard from "../../components/dashboard/ResourcesCard.jsx";
import HiringChart from "../../components/dashboard/HiringChart.jsx";

export default function HRDashboard({ topSlot = null }) {
  return (
    
       <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        {topSlot}
        <WelcomeCard />
        <AlertCard />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 280px",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>
            <HiringInsights />
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <QuickActions />
            <PeopleCard />
            <PayrollCard />
            <ResourcesCard />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}