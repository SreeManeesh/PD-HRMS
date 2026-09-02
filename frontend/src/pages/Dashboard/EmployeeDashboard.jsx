/**
 * Employee Dashboard — 
 */
import MainLayout from "../../components/layout/MainLayout.jsx";
import AttendanceWidget from "../../components/dashboard/AttendanceWidget.jsx";
import LeaveBalanceWidget from "../../components/dashboard/LeaveBalanceWidget.jsx";
import PayslipWidget from "../../components/dashboard/PayslipWidget.jsx";
import BirthdaysWidget from "../../components/dashboard/BirthdaysWidget.jsx";
import SelfAssessmentWidget from "../../components/dashboard/SelfAssessmentWidget.jsx";
import ComplianceCoursesWidget from "../../components/dashboard/ComplianceCoursesWidget.jsx";
import DashboardQuickActions from "../../components/dashboard/DashboardQuickActions.jsx";
import CollapsibleDashboardSection from "../../components/dashboard/CollapsibleDashboardSection.jsx";
import PendingPoliciesWidget from "../../components/dashboard/PendingPoliciesWidget.jsx";
import RecentNotificationsWidget from "../../components/dashboard/RecentNotificationsWidget.jsx";
import "./EmployeeDashboard.css";


export default function EmployeeDashboard({ user }) {
  return (
    <MainLayout>
      <div className="employee-dashboard">
        <div className="employee-dashboard-hero">
          <div>
          <span className="employee-dashboard-eyebrow">Employee workspace</span>
          <h1>
            {user?.greeting || "Good day"}, {user?.firstName || user?.name || ""} 👋
          </h1>
          <p>Here’s your workday, progress and pending actions in one place.</p>
          </div>
          <div className="employee-dashboard-hero-orb" aria-hidden="true"><span>Today</span><strong>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</strong></div>
        </div>

        <DashboardQuickActions />

        <div className="employee-dashboard-section-heading">
          <p>Today at a glance</p>
          <span>Your most important work information</span>
        </div>
        <div className="employee-dashboard-grid employee-dashboard-grid-primary">
          <AttendanceWidget />
          <LeaveBalanceWidget />
          <PayslipWidget />
          <SelfAssessmentWidget />
        </div>

        <CollapsibleDashboardSection title="Updates & reminders" subtitle="Notifications, policies, birthdays and training" defaultOpen>
          <div className="employee-dashboard-grid">
            <RecentNotificationsWidget />
            <PendingPoliciesWidget />
            <BirthdaysWidget />
            <ComplianceCoursesWidget />
          </div>
        </CollapsibleDashboardSection>
      </div>
    </MainLayout>
  );
}
