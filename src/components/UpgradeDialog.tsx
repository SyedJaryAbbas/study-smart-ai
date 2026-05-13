import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function UpgradeDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elegant mb-2">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <DialogTitle className="text-center">Upgrade to keep going</DialogTitle>
          <DialogDescription className="text-center">{reason}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Link to="/pricing" onClick={() => onOpenChange(false)}>
            <Button className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              See plans
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
