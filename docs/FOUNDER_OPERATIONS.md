# Founder operational authority
SPACECASE_FOUNDER is a distinct global PEOS role: its active assignment must have organisation_id NULL and an active person, current start and unexpired end. School administrator/principal roles and school-scoped copies of this role do not grant founder authority. There is no email, client claim or environment allowlist bypass.

The SpaceCase support context contract returns canonical person ID, founder flag and schools where the user is currently staff with a teacher/principal/administrator role. Founder school directory/profile contracts expose operational metadata and aggregate counts, not learner names, IDs, assessments, attendance marks or family information. Reads are audited. Search is literal, paged and alphabetically ordered. Counts are timestamped; profile class lists are bounded and disclose truncation.

Role provisioning is an operator action in the existing PEOS role tables, not a new identity store or public role-grant endpoint. Grant only the verified founder's existing canonical person, audit the grant, and revoke by ending the role assignment. No learner support-access grants are implemented in this release.
