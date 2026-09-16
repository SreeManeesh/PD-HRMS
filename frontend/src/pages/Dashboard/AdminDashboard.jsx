/**
 * Admin/Management dashboard — org-wide KPIs, hiring funnel, payroll trends.
 */
import MainLayout from "../../components/layout/MainLayout.jsx";
import WelcomeCard from "../../components/shared/Dashboardgreeting.jsx";
import OrgKpisWidget from "../../components/dashboard/OrgKpisWidget.jsx";
import DepartmentPerformanceWidget from "../../components/dashboard/DepartmentPerformanceWidget.jsx";
import HiringFunnelWidget from "../../components/dashboard/HiringFunnelWidget.jsx";
import PayrollCostTrendWidget from "../../components/dashboard/PayrollCostTrendWidget.jsx";
import SatisfactionWidget from "../../components/dashboard/SatisfactionWidget.jsx";
import ProductivityWidget from "../../components/dashboard/ProductivityWidget.jsx";
import DemoBanner from "../../components/shared/DemoBanner.jsx";

export default function AdminDashboard() {
  return (
    <MainLayout>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        {/* Hero greeting banner */}
        <WelcomeCard />
        <DemoBanner module="Admin Dashboard" />

        {/* Widget grid — responsive: 3 columns on desktop, 2 on tablet, 1 on mobile */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "18px",
        }}>
          <OrgKpisWidget />
          <DepartmentPerformanceWidget />
          <HiringFunnelWidget />
          <PayrollCostTrendWidget />
          <SatisfactionWidget />
          <ProductivityWidget />
        </div>
      </div>
    </MainLayout>
  );
}