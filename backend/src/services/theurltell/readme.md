# theurltell

where a url really goes, told by prixie, not by a site. or simply put:
her own wheregoes.com, except no third party ever sees the url and no
session ever opens the shortener.

the links she reads come padded with marketing: bit.ly wrappers,
redirect chains, utm trackers. tracing them through someone else's
site would hand the url to that site and accept its verdict. the
tell instead:

- walks the http redirect chain itself, hop by hop, with
  `redirect: "manual"` so every `location` header is READ, not
  followed by an engine that could load anything
- strips the tracking params before the first request (they are
  analytics, not routing: they never even get the ping)
- re-runs the link safety verdict on every hop, so a chain bending
  toward `javascript:`, raw ips, or credential lures dies mid-tell
- honors the one non-http redirect that can be read without
  executing anything: the meta refresh, parsed from the source
- fails closed: a broken chain, a loop, or a >12-hop maze is told as
  blocked, and `destination` stays null

and the rule that names the module: she only ever goes to the
destination site. the tell reads the chain; a session opens the
destination. the shortener hop and its marketing pixels are told,
never visited.

javascript hops (`window.location` and friends) are out of scope,
honestly: a chain that only moves via script ends at its html page,
and that page is what gets told.

same naming spirit as themailtell: the module that tells what the mail
carries. this one tells what the url carries.
