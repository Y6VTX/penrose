var Render = (function(){

    /**
     * [tex2svg description]
     * @param  {[type]}   texstring [description]
     * @param  {[type]}   id        to be used to insert into dictionary
     * @param  {Function} callback  [description]
     * @return {[type]}             [description]
     */
    function tex2svg(texstring, id) {
        return new Promise(function(resolve, reject){
            var input = texstring;
            var wrapper = document.createElement("div");
            wrapper.innerHTML = input;
            MathJax.Hub.Queue(["Typeset", MathJax.Hub, wrapper]);
            MathJax.Hub.Queue(function() {
                var mjOut = wrapper.getElementsByTagName("svg")[0];
                mjOut.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                svg = mjOut.outerHTML;
                // FIXME: delete wrapper?
                resolve({ "name": id, "svg": svg });
                // TODO: reject??
            });
        })
    }

    /**
     * handler for dragging event, called in the middle of dragging event
     * @param  {float} dx movement along x axis
     * @param  {float} dy movement along y axis
     */
    var move = function(dx, dy) {
        this.attr({
            transform: this.data('origTransform') + (this.data('origTransform') ? "T" : "t") + [dx, dy]
        });
        // Increment distance traveled
        this.data("ox", dx);
        this.data("oy", dy);
        // console.log(dx + " " + dy)
    }

    /**
     * handler for dragging event, called at the start of dragging event
     * @param  {float} dx NOT USED
     * @param  {float} dy NOT USED
     */
    var start = function(dx, dy) {
        this.data('origTransform', this.transform().local );
        this.data("ox", 0);
        this.data("oy", 0);
        this.attr({opacity: 0.5});
    }

    /**
     * handler for dragging event, called at the end of dragging event
     * @param  {float} dx NOT USED
     * @param  {float} dy NOT USED
     */
    var stop = function() {
        if(DEBUG) {
            console.log('finished dragging: ');
            console.log('distance: ' + this.data("ox") + " " + this.data("oy"));
        }
        this.attr({opacity: 1});
        var dict = { "tag" : "Drag",
        "contents" : {
            "name" : this.data("name"),
            "xm" : this.data("ox"),
            "ym" : this.data("oy")}
        }
        var json = JSON.stringify(dict)
        if(DEBUG) {
            console.log("Updating dragging event to server: ")
            console.log(json)
        }
        ws.send(json)
    }

    /*
    * Translate coordinates from polar to cartesian
    * Adopted from: https://codepen.io/AnotherLinuxUser/pen/QEJmkN
    * (Added by Dor)
    */
    function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        var angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    }

    /*
     * Given center point, radius, and angels return an arc path
     * Adopted from: https://codepen.io/AnotherLinuxUser/pen/QEJmkN
     * (Added by Dor)
     * Contaikns only the arc
     * FIXME: refactor
     */
     function describeArc(x, y, radius, startAngle, endAngle) {
        var start = polarToCartesian(x, y, radius, endAngle);
        var end = polarToCartesian(x, y, radius, startAngle);
        var arcSweep = endAngle - startAngle <= 180 ? "0" : "1";
        return [
        "M", start.x, start.y,
        "A", radius, radius, 0, arcSweep, 0, end.x, end.y
        ].join(" ");
    }

    /*
     * Given center point, radius, and angels return an arc path
     * Adopted from: https://codepen.io/AnotherLinuxUser/pen/QEJmkN
     * (Added by Dor)
     * Returns the full "pie wedge" path
     * FIXME: refactor
     */
    function describeFullArc(x, y, radius, startAngle, endAngle) {
        var start = polarToCartesian(x, y, radius, endAngle);
        var end = polarToCartesian(x, y, radius, startAngle);
        var arcSweep = endAngle - startAngle <= 180 ? "0" : "1";
        return [
        "M", start.x, start.y,
        "A", radius, radius, 0, arcSweep, 0, end.x, end.y,
        "L", x, y,
        "L", start.x, start.y
        ].join(" ");
    }

    /*
     * Given center point, radius, and angels return an arc path
     * Adopted from: https://codepen.io/AnotherLinuxUser/pen/QEJmkN
     * (Added by Dor)
     * Contaikns only the arc
     * FIXME: refactor
     */
    function describeArc(x, y, radius, startAngle, endAngle) {
        var start = polarToCartesian(x, y, radius, endAngle);
        var end = polarToCartesian(x, y, radius, startAngle);
        var arcSweep = endAngle - startAngle <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y,
            "A", radius, radius, 0, arcSweep, 0, end.x, end.y
        ].join(" ");
    }

    /**
     * FIXME: refactor
     */
    function renderPoints(canvas, point_list, dx, dy) {
        for(var i = 0; i < point_list.length; i++) {
            var xy = toScreen(point_list[i], dx, dy);
            var point = canvas.circle(xy[0], xy[1], 5);
            point.attr({
                fill: "none"
            })
        }
    }

    /**
     * Top-level function that renders a frame of Penrose diagram
     * @param       {WebSocket} ws    WebSocket connection
     * @param       {Snap} s          Snap.svg canvas
     * @param       {JSON} data       Scene data from Haskell server
     * @param       {Boolean} firstrun flag indicating whether is this the first frame
     */
    function _renderScene(ws, s, shapes, labels, firstrun) {
        s.clear()
        // NOTE: just using clientWidth/Height does not work on Firefox
        // see https://stackoverflow.com/questions/13122790/how-to-get-svg-element-dimensions-in-firefox
        if(DEBUG) {
            console.log("Incoming GPIs from server: ")
            console.log(shapes)
        }
        for (var key in shapes) {
            // retrieve a shape and its associated properties
            var shape = shapes[key]
            var props = {}
            var type  = shape[0]
            for(var i in shape[1]) { props[i] = shape[1][i].contents }

            // TODO: transform coordinates to screen space

            switch(type) {
                case 'Circle'        : _renderCircle(s, props); break
                case 'Eillipse'      : _renderEllipse(s, props); break
                case 'Text'          : _renderLabel(s, props, labels, firstrun); break
                case 'Point'         : _renderPoint(s, props); break
                case 'Rectangle'     : _renderRectangle(s, props); break
                case 'Square'        : _renderSquare(s, props); break
                case 'Arrow'         : _renderArrow (s, props); break
                case 'AngleMark'     : _renderAngleMark(s, props); break
                case 'Curve'         : _renderCurve(s, props); break
                case 'Line'          : _renderLine(s, props); break
                case 'Parallelogram' : _renderParallelogram(s, props); break
                case 'Image'         : _renderImage(s, props); break
            }

            // TODO: register drag commands

        }
        // Send the bbox information and label dimensions to the server
        if(firstrun) {
            var dict = { "tag" : "Update", "contents" : { "shapes" : shapes } }
            var json = JSON.stringify(dict)
            ws.send(json)
        }
    }

    /**
     * Renders a circle on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderCircle(s, properties) {
        [x, y] = Utils.scr([properties.x, properties.y])
        var circ = s.circle(x, y, properties.r);
        circ.data("name", properties.name)
        var color = properties.color
        var opacity = properties.style == "filled" ? color[3] : 0
        circ.attr({
            fill: Utils.hex(color[0], color[1], color[2]),
            "fill-opacity": opacity,
            "stroke-width": properties["stroke-width"],
            "stroke": "black",
        });
        if(properties["stroke-style"] == "dashed") {
            circ.attr({
                strokeDasharray: "7, 5" // "10"
            })
        }
        circ.drag(move, start, stop)
    }

    /**
     * Renders an ellipse on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderEllipse(s, obj) {
        [x, y] = Utils.scr([properties.xe, properties.ye])
        var ellip = s.ellipse(x, y, properties.rx, properties.ry);
        ellip.data("name", properties.namee)
        var color = properties.colore
        ellip.attr({
            fill: Utils.hex(color.r, color.g, color.b),
            "fill-opacity": color.a,
        });
        ellip.drag(move, start, stop)
    }

    /**
     * Renders an image on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
     function _renderImage(s, obj) {
        [x, y] = Utils.scr([properties.xin, properties.yn])
        var sizeX = properties.sizeXim
        var sizeY = properties.sizeYim
        var path = properties.path
        var image = s.image(path, x, y, sizeX, sizeY)
        image.data("name", properties.nameim)
        image.drag(move, start, stop)
    }

    /**
     * Renders a label on the canvas. Note that the labels are pre-generated
     * by the main module separately. This function merely performs a lookup
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     * @param       {JSON} lebels TODO
     * @param       {boolean} firstrun if this is the first run of the server, send back the bbox info
     */
    function _renderLabel(s, properties, labels, firstrun) {
        if(labels[properties.name]) {
            [x, y] = Utils.scr([properties.x, properties.y])
            var e = Snap.parse(labels[properties.name])
            t = s.g()
            t.append(e)
            var bbox = t.getBBox()
            var mat = new Snap.Matrix()
            // Fix the center of labels
            mat.translate(x, y)
            mat.translate(-bbox.width/2, -bbox.height/2)
            t.transform(mat.toTransformString())
            if(firstrun) {
                properties.w = bbox.width
                properties.h = bbox.height
            }
            t.data("name", properties.name)
            t.drag(move, start, stop)
            if(DEBUG) {
                _renderBoundingBox(s, t)
                s.circle(x, y, 2)
                //  _renderBoundingCircle(s, t)
            }
        }
    }

    // DEPRECATED
    function _renderLabel_OLD(s, obj, firstrun) {
        [x, y] = Utils.scr([properties.xl, properties.yl])
        var t = s.text(x, y, [properties.textl]);
        t.data("name", properties.namel)
        t.attr({
            "font-style": "italic",
            "font-family": "Palatino"
        });
        var bbox = t.getBBox()
        var mat = new Snap.Matrix()
        // Fix the center of labels
        mat.translate(-bbox.width/2, bbox.height/2)
        t.transform(mat.toTransformString())
        t.drag(move, start, stop)
        if(firstrun) {
            properties.wl = bbox.width
            properties.hl = bbox.height
        }
        if(DEBUG) {
            _renderBoundingBox(s, t)
            _renderBoundingCircle(s, t)
        }
    }

    /**
     * Renders a point on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderPoint(s, obj) {
        [x, y] = Utils.scr([properties.xp, properties.yp])
        // FIXME: point radius is hardcoded
        var pt = s.circle(x, y, 4);
        pt.data("name", properties.namep)
        var color = properties.colorp
        pt.attr({
            fill: "#000000",
            "fill-opacity": 1
        });
        pt.drag(move, start, stop)
    }

    /**
     * Renders a square on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderSquare(s, obj) {
        [x, y] = Utils.scr([properties.xs, properties.ys])
        var side = properties.side
        var sq = s.rect(x - side/2, y - side/2, side, side);
        sq.data("name", properties.names)
        var color = properties.colors
        sq.attr({
            fill: Utils.hex(color.r, color.g, color.b),
            "fill-opacity": color.a,
            "stroke-width": properties.strokec,
            // "stroke-width": 2,
            "stroke": "black"
        });
        if(properties.stylec == "dashed") {
            sq.attr({
                strokeDasharray: "7, 5" // "10"
            })
        }
        sq.drag(move, start, stop)
    }

    /**
     * Renders a bezier curve on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderCurve(s, obj) {
        var curve = s.path(Utils.path_str(properties.pathcb));
        curve.data("name", properties.namecb)
        var color = properties.colorcb;
        // by default, the curve should be solid
        curve.attr({
            fill: "transparent",
            strokeWidth: 2.5, // this should be settable in Style
            stroke: Utils.hex(color.r, color.g, color.b)
        });
        if(properties.stylecb == "dashed") {
            curve.attr({
                strokeDasharray: "7, 5" // "10"
            });
        }
        curve.drag(move, start, stop)
        // DEBUG: showing control points and poly line
        if (DEBUG) {
            var polyLine = s.polyline(allToScreen(properties.pathcb));
            var controlPts = renderPoints(s, properties.pathcb, dx, dy);
            polyLine.attr({
                fill: "transparent",
                strokeWidth: 5,
                stroke: Utils.hex(color.r, color.g, color.b),
                strokeDasharray: "10"
            });
        }
    }

    /**
     * Renders an arrow on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     * FIXME: factor out head styling code
     */
    function _renderArrow(s, obj) {
        var style    = properties.stylesa
        var [sx, sy] = Utils.scr([properties.startx, properties.starty])
        var [ex, ey] = Utils.scr([properties.endx, properties.endy])
        var t        = properties.thickness / 6
        var len      = Snap.len(ex, ey, sx, sy)
        var body_path = [0, t, len - 5*t, t, len - 5*t, -1*t, 0, -1*t]
        var head_path = [len - 5*t, 3*t, len, 0, len - 5*t, -3*t]
        var angle = Snap.angle(ex, ey, sx, sy)
        var myMatrix = new Snap.Matrix();
        myMatrix.translate(sx , sy);
        myMatrix.rotate(angle, 0, 0);
        // console.log(properties.namesa + " ex: " + ex + ", ey: " + ey + " angle: " + angle + "\n");
        var color = properties.colorsa
        if(style == "straight"){
            var line = s.polygon(body_path).transform(myMatrix.toTransformString())
        }
        if(style == "curved"){
            line = s.path(describeArc(len/2-2.4*t,0,len/2,-90,90)).transform(myMatrix.toTransformString())
            line.attr({
                "fill-opacity" : 0,
                stroke: Utils.hex(color.r, color.g, color.b),
                strokeWidth: 2
            })
        }

        if(style == "length"){
            //document.write(toPathString([[0,(-(4*t))],[0,(4*t)]],0,0))
            var p = "M " + 0 + " " + (-(4*t)) + " L " + 0 + " " + (4*t) +  " L " + 0 + " " + 0 + " L " + (len-(5*t)) + " " + 0;
            var tail1 = s.path(p)
            .transform(myMatrix.toTransformString())
            tail1.attr({
                "fill-opacity" : 0,
                stroke: Utils.hex(color.r, color.g, color.b),
                strokeWidth: 2
            })
            var head1 = s.path(toPathString([[(len-(5*t)),(-(4*t))],[len-(5*t),(4*t)]],0,0)).transform(myMatrix.toTransformString())
            head1.attr({
                "fill-opacity" : 0,
                stroke: Utils.hex(color.r, color.g, color.b),
                strokeWidth: 2
            })
            var g1 = s.g(head1, tail1)
            g1.data("name", properties.namesa)
            g1.drag(move, start, stop)
        }
        else{
            var head = s.polyline(head_path).transform(myMatrix.toTransformString())
            var g = s.g(line, head)
            g.data("name", properties.namesa)
            g.drag(move, start, stop)
        }
    } // end of _renderArrow

    /**
     * Renders a rectangle on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderRectangle(s, obj) {
        [x, y] = Utils.scr([properties.xr, properties.yr])
        var rect = s.rect(x - properties.sizeX/2, y - properties.sizeY/2, properties.sizeX, properties.sizeY);
        rect.data("name", properties.namer)
        var color = properties.colorr;
        rect.attr({
            fill: Utils.hex(color.r, color.g, color.b),
            "fill-opacity": color.a,
        });
        rect.drag(move, start, stop)
    }

    /**
     * Renders a line segment on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     */
    function _renderLine(s, obj) {
        var path = [[properties.startx_l, properties.starty_l], [properties.endx_l, properties.endy_l]];
        var curve = s.path(Utils.path_str(path));
        curve.data("name", properties.name_l)
        var color = properties.color_l;
        // by default, the curve should be solid
        curve.attr({
            fill: "transparent",
            strokeWidth: properties.thickness_l,
            stroke: Utils.hex(color.r, color.g, color.b)
        });
        if(properties.style_l == "dashed") {
            curve.attr({
                strokeDasharray: "7, 5" // "10"
            });
        }
        curve.drag(move, start, stop)
    }

    /**
     * Renders an Angle Mark on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     * FIXME: refactor
     */
     function _renderAngleMark(s, obj) {
         var isRightar = properties.isRightar
         var sizear = properties.sizear
         var color = properties.colorar
         var xar = properties.xar
         var yar = properties.yar
         var style = properties.stylear
         var rotationar = properties.rotationar
         if(isRightar == "true") {
             //Draw PrepMark (for right angle)
             var myMatrix = new Snap.Matrix();
             // FIXME: this doesn't compile yet
             // TODO: test these shapes
             [origX, origY] = Utils.scr([xar, yar])
             myMatrix.translate(origX, origY);
             myMatrix.rotate(rotationar, 0, 0);
             var path = "M " + 0 + " " + (-sizear)+ " L "
             + sizear + " " +  (-sizear) + " L "
             + sizear + " " + yar
             var p = s.path(path).transform(myMatrix.toTransformString())
             p.attr({
                 fill: Utils.hex(color.r, color.g, color.b),
                 "fill-opacity": 0,
                 stroke: Utils.hex(color.r, color.g, color.b),
                 strokeWidth: 2
             });
             if(style == "line"){
                 p.data("name", properties.namear)
                 p.drag(move, start, stop)

             } else if (style == "wedge") {

                 var rectPpath = "M " + 0 + " " + (-sizear)+ " L "
                 + sizear + " " +  (-sizear) + " L "
                 + sizear + " " + 0 + " L " + 0 + " " + 0

                 var f = s.path(rectPpath).transform(myMatrix.toTransformString());
                 f.attr({
                     fill: Utils.hex(0, 0, 205),
                     "fill-opacity": 0.6,
                 });
                 var g = s.g(p,f)
                 g.data("name", properties.namear)
                 g.drag(move, start, stop)
             }
         }

         if(isRightar == "false"){
             //Draw arc (for regular angles)
             var anglear = properties.anglear > 360.0 ? 360.0 - properties.anglear : properties.anglear
             anglear = anglear < 0 ? 360 + anglear : anglear
             var radiusar = properties.radiusar
             var arcPath = describeArc(dx + xar, dy + yar, radiusar, rotationar,
                 anglear < 0 ? (rotationar - anglear) : (rotationar + anglear));
                 var arc = s.path(arcPath);
                 arc.attr({
                     "fill-opacity": 0,
                     stroke: Utils.hex(color.r, color.g, color.b),
                     strokeWidth: 2
                 });
                 if(style == "line"){
                     arc.data("name", properties.namear)
                     arc.drag(move, start, stop)
                 } else if (style == "wedge") {
                     var pf = describeFullArc(dx + xar, dy + yar, radiusar, rotationar,
                         anglear < 0 ? (rotationar - anglear) : (rotationar + anglear));
                         var f = s.path(pf);
                         f.attr({
                             fill: Utils.hex(0, 0, 205),
                             "fill-opacity": 0.6,
                         });
                         var g = s.g(arc,f)
                         g.data("name", properties.namear)
                         g.drag(move, start, stop)
                     }

                 }
     }

    /**
     * Renders a parallelogram on the canvas
     * @param       {Snap} s  Snap.svg global object
     * @param       {JSON} obj JSON object from Haskell server
     * FIXME: refactor
     */
     function _renderParallelogram(s, obj) {
         // TODO fix this!
         [sx, sy] = Utils.scr([properties.xpa, properties.ypa])
         var sizeX = properties.sizeXpa;
         var sizeY = properties.sizeYpa;
         var angle = properties.anglepa;
         var rotation = properties.rotationpa
         var path = ""
         if(angle <= 90.0){
             path = "M " + (-(sizeX/2) - sizeY/getTanFromDegrees(angle)) + " " + (-(sizeY/2)) +  " L " +
             (-(sizeX/2)) + " " + (sizeY/2) +  " L " +  (sizeX/2) + " " + (sizeY/2) +  " L " +
             ((sizeX/2) - (sizeY/getTanFromDegrees(angle))) + " " + (-(sizeY/2))
         }
         else{
             path = "M " + (-(sizeX/2)) + " " + (sizeY/2) +  " L " +
             (sizeX/2) + " " + (sizeY/2) +  " L " + ((sizeX/2) + sizeY/getTanFromDegrees(angle)) + " " + (-(sizeY/2))
             +  " L " + (-(sizeX/2) + (sizeY/getTanFromDegrees(angle))) + " " + (-(sizeY/2))
         }

         var myMatrix = new Snap.Matrix();
         myMatrix.translate(sx, sy);
         myMatrix.rotate(rotation, 0, 0);
         var parallelogram = s.path(path).transform(myMatrix.toTransformString())
         parallelogram.data("name", properties.namepa)
         var color = properties.colorpa;
         parallelogram.attr({
             fill: Utils.hex(color.r, color.g, color.b),
             "fill-opacity": color.a
         });
         parallelogram.drag(move, start, stop)
     }



    // helper method that draws bbox around an object
    function _renderBoundingBox(s, obj) {
        // render the bbox
        var sq = s.path(obj.getBBox().path);
        sq.attr({
            "fill-opacity": 0,
            stroke: "#000",
            strokeWidth: 1
        })
    }

    // helper method that draw's bounding circle around an object
    // FIXME: figure out where the center of the circle is
    function _renderBoundingCircle(s, obj) {
        // render Bounding circle
        var bbox = properties.getBBox()
        var circ = s.circle(bbox.cx, bbox.cy, bbox.r0)
        circ.attr({
            "fill-opacity": 0,
            stroke: "#000",
            strokeWidth: 1
        })
    }

    /**
     * TODO [_collectLabels description]
     * @param       {[type]} data [description]
     * @constructor
     * @return      {[type]}      [description]
     */
    async function _collectLabels(data) {
        var res = {}
        var promises = []
        for (var key in data) {
            var record = data[key]
            var properties = record[1]
            if(record[0] == 'Text') {
                var text = properties.text.contents
                if(text != "") {
                    var label = await tex2svg("$" + properties.text.contents + "$", properties.name.contents)
                    // var parser = new DOMParser();
                    // var doc = parser.parseFromString(svg, "image/svg+xml");
                    // document.getElementsByTagName('body')[0].appendChild(doc.documentElement);
                    res[label.name] = label.svg
                }
            }
        }
        return res
    }


    return {
        scene: _renderScene,
        collectLabels: _collectLabels
    };
})(); // end of Render namespace