from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from medical_profiles.models import MedicalProfile, VerificationStatus
from verification.models import VerificationRequest, VerificationRequestStatus
from verification.services import REQUEST_TO_PROFILE_STATUS


class Command(BaseCommand):
    # One-off repair for data written while MedicalProfile.submit_by_patient()
    # auto-set VERIFIED on every patient save. For each patient:
    #   - the latest non-withdrawn VerificationRequest is the truth, and the
    #     profile's verification_status is re-derived from it;
    #   - a patient with no request at all can't be verified (or flagged, etc.)
    #     and goes back to Pending (Unsubmitted profiles are left alone);
    #   - any older non-withdrawn requests are withdrawn, as a resubmit to a
    #     new hospital now does, so a stale flag can't linger on another
    #     hospital's dashboard.
    # verified_by/verified_at are filled from the approving review when
    # missing, and a verified_at with no verified_by (the auto-verify
    # timestamp) is cleared when the profile is no longer verified.
    # Idempotent — a second run changes nothing.
    help = "Re-derive MedicalProfile.verification_status from each patient's latest VerificationRequest."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, dry_run=False, **options):
        changed = withdrawn = edited_after_approval = 0

        with transaction.atomic():
            profiles = MedicalProfile.objects.select_related("patient").order_by("created_at")
            for profile in profiles:
                live_requests = list(
                    VerificationRequest.objects
                    .filter(patient=profile.patient)
                    .exclude(status=VerificationRequestStatus.WITHDRAWN)
                    .order_by("-submitted_at")
                )
                live, stale = (live_requests[0], live_requests[1:]) if live_requests else (None, [])

                if live:
                    target = REQUEST_TO_PROFILE_STATUS[live.status]
                elif profile.verification_status in (
                    VerificationStatus.UNSUBMITTED, VerificationStatus.PENDING,
                ):
                    target = profile.verification_status
                else:
                    target = VerificationStatus.PENDING

                fields = []
                if profile.verification_status != target:
                    self.stdout.write(
                        f"{profile.patient_id} ({profile.patient.get_full_name()}): "
                        f"{profile.verification_status} -> {target}"
                    )
                    profile.verification_status = target
                    fields.append("verification_status")

                if target == VerificationStatus.VERIFIED and profile.verified_by_id is None:
                    profile.verified_by_id = live.reviewed_by_id
                    profile.verified_at = live.reviewed_at
                    fields += ["verified_by", "verified_at"]
                elif (
                    target != VerificationStatus.VERIFIED
                    and profile.verified_by_id is None
                    and profile.verified_at is not None
                ):
                    profile.verified_at = None
                    fields.append("verified_at")

                if fields:
                    changed += 1
                    if not dry_run:
                        profile.save(update_fields=fields + ["updated_at"])

                if stale:
                    withdrawn += len(stale)
                    for req in stale:
                        self.stdout.write(
                            f"{profile.patient_id}: withdraw stale {req.status} request {req.id}"
                        )
                    if not dry_run:
                        VerificationRequest.objects.filter(
                            id__in=[r.id for r in stale]
                        ).update(
                            status=VerificationRequestStatus.WITHDRAWN,
                            updated_at=timezone.now(),
                        )

                # Not changed: approved, but the patient edited afterwards under
                # the old auto-verify code. Under the new rule that edit would
                # have reset them to Pending; reported for manual review only.
                if (
                    live
                    and live.status == VerificationRequestStatus.APPROVED
                    and live.reviewed_at
                    and profile.last_updated_by_id == profile.patient_id
                    and profile.last_updated_at
                    and profile.last_updated_at > live.reviewed_at
                ):
                    edited_after_approval += 1
                    self.stdout.write(
                        f"{profile.patient_id}: NOTE approved, but patient edited "
                        f"after approval — left Verified, review manually"
                    )

            if dry_run:
                transaction.set_rollback(True)

        update, withdraw = (
            ("[dry run] would update", "would withdraw") if dry_run else ("Updated", "withdrew")
        )
        self.stdout.write(self.style.SUCCESS(
            f"{update} {changed} profile(s); {withdraw} {withdrawn} stale request(s); "
            f"{edited_after_approval} approved profile(s) edited after approval flagged for review."
        ))
