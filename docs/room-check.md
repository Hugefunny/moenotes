# Room Check (retired)

The room tool has been withdrawn. It is no longer registered in navigation, search, or generated pages.
The deploy server answers **410 Gone** for the old `/tools/room-check` page (including localized paths)
and `/api/room-check` endpoints, before the generic account proxy and static-page handling. Cached clients
cannot create or watch rooms through this site. Other account endpoints remain available.

`MOENOTES_ROOM_CHECK_INTERNAL` and `MOENOTES_ROOM_CHECK_KEY` are no longer read. The independent room service
is not managed or stopped by this change. Existing game rooms and user accounts are not deleted.
