import os
import re

frontend_dir = r"c:\Users\srira\assignhub-production\assignhub\frontend"

nav_regex = re.compile(r'<!-- Mobile Bottom Navigation -->\s*<div class="mobile-bottom-nav">.*?</div>', re.DOTALL)

student_nav = """<!-- Mobile Bottom Navigation -->
  <div class="mobile-bottom-nav">
    <a href="student-dashboard.html" class="nav-dashboard">
      <iconify-icon icon="lucide:layout-dashboard" class="text-xl"></iconify-icon>
      <span>Home</span>
    </a>
    <a href="student-assignments.html" class="nav-assignments">
      <iconify-icon icon="lucide:book-open" class="text-xl"></iconify-icon>
      <span>Tasks</span>
    </a>
    <a href="student-submissions.html" class="nav-submissions">
      <iconify-icon icon="lucide:send" class="text-xl"></iconify-icon>
      <span>Submit</span>
    </a>
    <a href="student-notifications.html" class="nav-notifications">
      <iconify-icon icon="lucide:bell" class="text-xl"></iconify-icon>
      <span>Alerts</span>
    </a>
  </div>"""

admin_nav = """<!-- Mobile Bottom Navigation -->
  <div class="mobile-bottom-nav">
    <a href="admin-dashboard.html" class="nav-dashboard">
      <iconify-icon icon="lucide:layout-dashboard" class="text-xl"></iconify-icon>
      <span>Home</span>
    </a>
    <a href="admin-assignments.html" class="nav-assignments">
      <iconify-icon icon="lucide:book-open" class="text-xl"></iconify-icon>
      <span>Tasks</span>
    </a>
    <a href="admin-submissions.html" class="nav-submissions">
      <iconify-icon icon="lucide:check-circle" class="text-xl"></iconify-icon>
      <span>Submit</span>
    </a>
    <a href="admin-notifications.html" class="nav-notifications">
      <iconify-icon icon="lucide:bell" class="text-xl"></iconify-icon>
      <span>Alerts</span>
    </a>
  </div>"""

def set_active(nav_html, active_class_name):
    # Just add 'active' to the class attribute for the given link
    # For example, class="nav-dashboard" -> class="nav-dashboard active"
    return nav_html.replace(f'class="{active_class_name}"', f'class="{active_class_name} active"')

for file in os.listdir(frontend_dir):
    if file.endswith(".html"):
        path = os.path.join(frontend_dir, file)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content
        
        # Determine what nav it needs
        if file.startswith("student-"):
            nav = student_nav
            if "dashboard" in file: nav = set_active(nav, "nav-dashboard")
            elif "assignment" in file: nav = set_active(nav, "nav-assignments")
            elif "submission" in file: nav = set_active(nav, "nav-submissions")
            elif "notification" in file: nav = set_active(nav, "nav-notifications")
            new_content = nav_regex.sub(nav, content)
        elif file.startswith("admin-"):
            nav = admin_nav
            if "dashboard" in file: nav = set_active(nav, "nav-dashboard")
            elif "assignment" in file: nav = set_active(nav, "nav-assignments")
            elif "submission" in file: nav = set_active(nav, "nav-submissions")
            elif "notification" in file: nav = set_active(nav, "nav-notifications")
            new_content = nav_regex.sub(nav, content)
        else:
            # Login, register, verify-email, forgot-password -> REMOVE NAV
            new_content = nav_regex.sub('', content)

        if new_content != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {file}")
