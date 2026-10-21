# under the hood

## architecture

the project uses tanstack start for server rendering, routing, metadata, and client navigation. each meaningful content area has its own route so it can be linked, indexed, and shared independently.

the root route owns the shared page shell. this shell provides the header, navigation, decorative background, content outlet, and footer. individual route files provide only the content and metadata unique to that page.

## design system

global semantic tokens live in `src/styles.css`. color roles describe intent, such as canvas, ink, ribbon, leaf, border, and accent. components consume those roles rather than embedding color values.

the visual reference is interpreted with css geometry rather than shipped as an image. this keeps text accessible, layouts responsive, and decoration lightweight.

## component boundaries

shared prixy components live together by product domain. the site shell handles global structure. page elements provide repeated editorial patterns such as page introductions, outlined panels, leaf lists, and pull quotes.

## data flow

the current site is static and has no application data flow. route components render local content and tanstack router handles navigation and metadata. a future product backend should expose session instructions and results through typed server functions while keeping platform-specific services behind small adapters.

## accessibility

the site uses semantic headings, lists, navigation landmarks, and decorative elements hidden from assistive technology. layouts preserve readable line lengths and collapse into a single column on smaller screens.